'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_FEED = 'http://www.manilatimes.net/feed/';
const BASE_URI = 'http://www.uefa.com/';
const PAGE_LINKS = 'http://www.uefa.com/uefachampionsleague/stories/index.html#/pg';

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



function ingest_article(hatch, item, global_thumbnail) {
    return libingester.util.fetch_html(item.link).then($ => {// console.log(item);
        const asset = new libingester.NewsArticle();
        const author = $('span[itemprop="author"] a').first().text() || item.title;
        const body = $('div[itemprop="articleBody"]').first();
        const modified_date = new Date(Date.parse(item.date));
        const read_more_link = `Original Article at <a href="${item.link}">www.uefa.com</a>`;
        const section = item.categories.join(', ');
        const synopsis = $('meta[property="og:description"]').attr('content') || '';
        const title = item.title;
        const uri_thumb = $('meta[property="og:image"]').attr('content');
        // const caption_thumb = asset_metadata.image.caption;
        // const copyright_thumb = asset_metadata.image.copyrightHolder;
        let main_image, thumbnail, figure, figcaption;

        // main image
        // if (uri_thumb) { // main image link
        //     main_image = libingester.util.download_image(uri_thumb);
        //     main_image.set_title(title);
        //     if (caption_thumb) { // text caption
        //         figcaption = $(`<figcaption><p>${caption_thumb}</p></figcaption>`);
        //         if (figcaption && copyright_thumb) { // copyright (main image)
        //             figcaption.find('p').append(`<br><span>${copyright_thumb}</span>`);
        //         }
        //     } else {
        //         figcaption = '';
        //     }
        //     asset.set_main_image(main_image, figcaption);
        //     asset.set_thumbnail(thumbnail = main_image);
        //     hatch.save_asset(main_image);
        // }

        // replace embed images
        body.find('.wp-caption').map((i,embed) => {
            const fig = $(embed).find('img').first();
            const lazy_uri = fig.attr('data-lazy-src');
            const width = fig.attr('width');
            const height = fig.attr('height');
            const src = lazy_uri.replace('-'+width+'x'+height, '');
            const alt = fig.attr('alt');
            if (src) {
                const figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                let caption = $(embed).find('.wp-caption-text').first().text();
                if (caption) {
                    figure.append(`<figcaption><p>${caption}</p></figcaption>`);
                }
                $(embed).replaceWith(figure);
            } else {
                $(embed).remove();
            }
        });

        // replace embed videos
        body.find('.article-embedded_video').map((i,embed) => {
            const div = $(embed).find('div').first();
            const video_data = div.attr('data-options');
            if (video_data) {
                const v_base_uri = 'http://www.uefa.com/video/includerjw.html';
                const v_metadata = JSON.parse(video_data);
                const download_uri = v_base_uri + '?vid=' + v_metadata.videoid;
                const video_thumb = libingester.util.download_image(v_metadata.posterpath);
                const video_title = decodeURIComponent(v_metadata.videoTitle).replace(/[+]/g,' ');
                const video = libingester.util.get_embedded_video_asset($(embed), download_uri);

                video_thumb.set_title(video_title);
                video.set_title(video_title);
                video.set_thumbnail(video_thumb);
                hatch.save_asset(video_thumb);
                hatch.save_asset(video);

                $(embed).replaceWith(figure);
            } else {
                $(embed).remove();
            }
        });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();
        clean_tags(body.find(CLEAN_ELEMENTS.join(',')));

        // download images
        body.find('img').map((i,img) => {
            clean_attr(img);
            const image = libingester.util.download_img(img);
            image.set_title(title);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
        });

        // thumbnail (if the article does not contain any image)
        if (!thumbnail && global_thumbnail) { // main image link
            asset.set_thumbnail(global_thumbnail);
        }

        // set lede
        let lede;
        for (const content of body.contents().get()) {
            if (content.name == 'p') {
                lede = $(content).clone();
                $(content).remove();
                break;
            }
        }

        // if the article no contain any p
        if (!lede ) lede = $(`<p>${synopsis}</p>`);

        // article settings
        asset.set_authors(author);
        asset.set_body(body);
        asset.set_canonical_uri(item.link);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_lede(lede);
        // asset.set_license(copyright);
        asset.set_section(section);
        asset.set_synopsis(synopsis);
        asset.set_title(item.title);
        asset.set_read_more_link(read_more_link);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        console.log(item.link, err);
    });
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const metadata = $('body script[type="application/ld+json"]').first().text();
        if (!metadata) return; // isn't video article
        const asset_metadata = JSON.parse(metadata);

        const asset = new libingester.VideoAsset();
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


const item = {
    link: 'http://www.manilatimes.net/helping-rebuild-lives/338083/',
    date: '2017-07-12T18:12:00.000Z',
    title: 'Un title',
    categories: [ 'Business' ],
    author: 'MAYVELIN U. CARABALLO, TMT',
};

function main() {
    const hatch = new libingester.Hatch('manila-times', 'en');
    const feed = libingester.util.create_wordpress_paginator(RSS_FEED);

    // muchos artículos no tienen imágenes, entonces el thumbnail de todos esos
    // artículos será esta ImageAsset global
    const uri_logo = 'http://manilatimes.net/wp-content/uploads/2016/08/MNL-Times_250-x-250-logo.jpg';
    const thumbnail = libingester.util.download_image(uri_logo);
    thumbnail.set_title('The Manila Times');
    hatch.save_asset(thumbnail);

    // ingest_article(hatch, item, thumbnail)
    //     .then(() => hatch.finish());



    libingester.util.fetch_rss_entries(feed, 50, 2).then(items =>
        Promise.all(items.map(item => ingest_article(hatch, item, thumbnail)))
            .then(() => hatch.finish())
    ).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
