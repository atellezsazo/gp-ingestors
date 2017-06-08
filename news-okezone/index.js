'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const rss2json = require('rss-to-json');

const FEED_RSS = "http://sindikasi.okezone.com/index.php/rss/1/RSS2.0"; //News RSS
const PAGE_GALLERY = 'http://news.okezone.com/foto'; // Galleries home section

//remove attributes from images
const REMOVE_ATTR = [
    'border',
    'class',
    'id',
    'style',
];

//Remove elements
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript', //any script injection
    'script', //any script injection
    'style',
    '#AdAsia', //Asia ads
    '#sas_44269',
    '.wrap-rekomen', //recomendation links
];

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.url).then($ => {
        const title = $('h1').first().text();
        if (!title) throw { code: -1 }; // malformed page

        const asset = new libingester.NewsArticle();
        const author = $('.author .nmreporter div').text();
        const body = $('#contentx, .bg-euro-body-news-hnews-content-textisi').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const copyright = $('meta[name="copyright"]').attr('content');
        const first_p = body.find('p').first();
        const modified_date = new Date(item.created);
        const page = 'news.okezone';
        const read_more = `Baca lebih lanjut tentang <a href="${canonical_uri}">${page}</a>`;
        const section = $('.bractive').first().text();
        const uri_main_image = $('#imgCheck').attr('src');

        // article settings
        console.log('processing', title);
        asset.set_authors([author]); //**
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri); //**
        asset.set_date_published(item.created); //**
        asset.set_last_modified_date(modified_date); //**
        asset.set_license(copyright);
        asset.set_read_more_link(read_more); //**
        asset.set_section(section); //**
        asset.set_source(page); //**
        asset.set_synopsis(item.description); //**
        asset.set_title(item.title); //**

        // pull out the main image
        const main_image = libingester.util.download_image(uri_main_image);
        const image_description = $('.caption-img-ab').children();
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image, image_description);

        // set first paragraph of the body
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));

        //Download images
        body.find('img').map(function() {
            if (this.attribs.src) {
                clean_attr(this);
                const image = libingester.util.download_img($(this));
                this.attribs['data-libingester-asset-id'] = image.asset_id
                image.set_title(title)
                hatch.save_asset(image);
            } else {
                $(this).remove();
            }
        });

        // download videos
        body.find('#molvideoplayer, p iframe').get().map(iframe => {
            const video = libingester.util.get_embedded_video_asset($(iframe), iframe.attribs.src);
            video.set_title(title);
            video.set_thumbnail(main_image);
            hatch.save_asset(video);
        });

        //remove and clean elements
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(first_p).remove();
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find('span').map((i,elem) => clean_attr(elem));

        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_article(hatch, item);
        }
    });
}

function ingest_gallery(hatch, item) {
    return libingester.util.fetch_html(item.url).then($ => {
        const title = $('h1').first().text();
        if (!title) throw { code: -1 }; // malformed page

        const asset = new libingester.NewsArticle();
        const author = $('.news-fr').text();
        const body = cheerio('<div></div>');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[name="description"]').attr('content');
        const lede = cheerio(`<div><p>${description}</p></div>`);
        const modified_date = new Date(item.pubDate); //This section doesn´t have date in metadata
        const page = 'news.okezone';
        const read_more = `Baca lebih lanjut tentang <a href="${canonical_uri}">${page}</a>`;

        console.log('processing', title);
        asset.set_authors(author);
        asset.set_canonical_uri(canonical_uri);
        asset.set_date_published(Date.now(modified_date));
        asset.set_last_modified_date(modified_date);
        asset.set_lede(lede);
        asset.set_read_more_link(read_more);
        asset.set_section("Gallery");
        asset.set_source(page);
        asset.set_synopsis(description);
        asset.set_title(title);

        // Create constant for body
        let thumbnail;
        $('.thumbnails img').get().map(img => {
            img.attribs.src = img.attribs.src.replace('small.', 'large.');
            const tag_img = $(img).clone();
            tag_img.removeAttr('style');
            const img_gallery = libingester.util.download_img(tag_img);
            img_gallery.set_title(title);
            hatch.save_asset(img_gallery);
            if(!thumbnail) asset.set_thumbnail(thumbnail = img_gallery);
            body.append(tag_img);
        });

        asset.set_body(body);
        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_gallery(hatch, item);
        }
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const get_item = ($, item) => {
        return {
            url: $(item).find('h3 a').attr('href'),
            pubDate: $(item).find('time').text().replace(/[\t\n\r]/g,''),
        }
    }

    // news articles
    const news = new Promise((resolve, reject) => {
        rss2json.load(FEED_RSS, function(err, rss) {
            Promise.all(rss.items.map(item => ingest_article(hatch, item)))
                .then(() => resolve());
        });
    });

    // gallery articles
    const gallery = libingester.util.fetch_html(PAGE_GALLERY).then($ => {
        const items = $('.content-hardnews').get().map(item => get_item($, item));
        return Promise.all(items.map(item => ingest_gallery(hatch, item)));
    });

    Promise.all([gallery, news])
        .then(() => hatch.finish());
}

main();
