'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const mustache = require('mustache');
const url = require('url');
const template = require('./template');

const BASE_URI = 'http://www.uefa.com/';
const PAGE_LINKS = 'http://www.uefa.com/uefachampionsleague/stories/index.html';

// cleaning elements
const CLEAN_ELEMENTS = [
    'a',
    'div',
    'figure',
    'i',
    'p',
    'span',
];

// delete attr (tag)
const REMOVE_ATTR = [
    'class',
    'height',
    'sizes',
    'style',
    'title',
    'width',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    '.article-embedded_video',
    '.article_header',
    '.article_social',
    '.btn',
    '.container-fluid',
    '.embedded-twitter',
    '.promoLibrary',
    'iframe',
    'noscript',
    'script',
    'style',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const article_body = $('.article_body').first();
        const article_summary = $('.article_summary').find('p').first(); /*for template body*/
        const article_top_content = $('.article_top-content').find('figure').first().parent(); /*for template body*/
        const author = $('meta[name="author"]').attr('content');
        const body = $(cheerio('<div></div>'));
        const category = $('.navbar-lv3-item-link').get() || $('.navbar-match-lv3-item-link').get();
        const copyright = $('.footer-disclaimer').find('p').first().text();
        const description = $('meta[property="og:description"]').attr('content');
        const modified_date = $('.article_date').text(); /*for template*/
        const section = $('meta[property="og:type"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        asset.set_license(copyright);
        asset.set_section(section);
        asset.set_synopsis(description);
        asset.set_title(title);

        // append body
        const _summary = cheerio(`<div class="summary"></div>`).append(article_summary);
        const _top_content = cheerio(`<div class="article-embedded_image"></div>`).append(article_top_content);
        body.append(_summary).append(_top_content).append(article_body);

        // replace embed images
        body.find('.article-embedded_image').get().map((embed) => {
            const figure = $(embed).find('figure').first();
            if (figure.length == 1) {
                const uri = url.resolve(BASE_URI, figure.attr('data-path')) + figure.attr('data-id') + '_w1.jpg';
                const caption = $(embed).find('.article-embedded_caption').first().clone();
                const credits = $(embed).find('.article-embedded_credits').first().clone();
                const image = cheerio(`<img src="${uri}"></img>`);
                const fig = cheerio('<figure></figure>');
                $(caption).attr('class', 'article-caption');
                $(credits).attr('class', 'article-credits');
                $(fig).append(image).append(caption).append(credits);
                $(embed).replaceWith(fig);
            } else {
                $(embed).replaceWith(cheerio(`<figure><img src="${uri_thumb}"></img></figure>`));
            }
        });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        article_body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        clean_tags(body.find(CLEAN_ELEMENTS.join(',')));

        // download images
        let thumbnail;
        body.find('img').get().map((img) => {
            clean_attr(img);
            const image = libingester.util.download_img(img);
            image.set_title(title);
            hatch.save_asset(image);
            if (!thumbnail) {
                asset.set_thumbnail(thumbnail = image);
            }
        });

        // generating tags
        const categories = cheerio('<div></div>');
        category.map((a) => categories.append(cheerio(`<a href="${a.attribs.href}">${$(a).text()}</a>`)));

        const content = mustache.render(template.structure_template, {
            author: author,
            body: body.html(),
            category: categories.html(),
            published: modified_date,
            title: title,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
        return ingest_article(hatch, uri);
    });
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.VideoAsset();
        const asset_metadata = JSON.parse($('script[type="application/ld+json"]').last().text());
        const copyright = $('.footer-disclaimer').find('p').first().text();
        const description = asset_metadata.description;
        const download_uri = asset_metadata.embedUrl;
        const modified_date = asset_metadata.uplodDate;
        const title = asset_metadata.name;
        const uri_thumb = asset_metadata.thumbnailUrl;

        // download thumbnail
        const thumb = libingester.util.download_image(uri_thumb);
        thumb.set_title(title);

        // video settings
        asset.set_canonical_uri(uri);
        asset.set_download_uri(download_uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        asset.set_synopsis(description);
        asset.set_thumbnail(thumb);
        asset.set_title(title);

        //save assets
        hatch.save_asset(thumb);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    libingester.util.fetch_html(PAGE_LINKS).then(($) => {
        const links = $('.article').get().map(article => $(article).parent().attr('href'));
        Promise.all(
            links.map(uri => {
                if (uri.includes('/video/')) {
                    return ingest_video(hatch, uri);    /** ingest video **/
                } else {
                    return ingest_article(hatch, uri);  /** ingest article **/
                }
            })
        ).then(() => {
            return hatch.finish();
        })
    });
}

main();
