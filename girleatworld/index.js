'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
// const mustache = require('mustache');
// const rss2json = require('rss-to-json');
const url = require('url');
//const template = require('./template');

const BASE_URI = 'https://girleatworld.net/';

// cleaning elements
const CLEAN_ELEMENTS = [
    'a',
    'div',
    'figure',
    'h2',
    'i',
    'p',
    'span',
    'ul'
];

// delete attr (tag)
const REMOVE_ATTR = [
    'class',
    'data-field',
    'data-original',
    'h',
    'height',
    'id',
    'itemscope',
    'itemprop',
    'itemtype',
    'photoid',
    'rel',
    'sizes',
    'style',
    'title',
    'type',
    'w',
    'width',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    '.sharedaddy',
    'iframe',
    'noscript',
    'script',
    'style',
];



function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const author = $('.entry-author a').text();
        const modified_date = new Date(Date.parse($('.entry-date').first().text()));
        const body = $('.entry-content').first();
        const tags = $('.entry-cats').text().trim().split(',');
        const page='Girl eat world';
        const read_more = 'Read more at www.girleatworld.net';
        const description = $('meta[property="og:description"]').attr('content');
        const published = $('.entry-date a').first().text(); // for template
        const modified_time = $('meta[property="article:modified_time"]').attr('content'); // for template
        const section = $('meta[property="og:type"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        console.log('----------------------------');
        console.log('uri', uri);
        console.log('----------------------------');
        console.log('canonical: ', canonical_uri);
        console.log('synopsis: ', description);
        console.log('modified_date: ', modified_date);
        console.log('section: ', section);
        console.log('page: ', page);
        console.log('read_more: ', read_more);
        console.log('title: ', title);
        console.log('uri_main_image: ', uri_main_image);
        console.log('tags: ', tags);
        console.log('----------------------------');

        // Pull out the main image 


        if (uri_main_image) { 
            const main_img = libingester.util.download_image(uri_main_image); 
            main_img.set_title(title); 
            hatch.save_asset(main_img); 
            asset.set_thumbnail(main_img);   
        } 

        // download images

       body.find('img').map(function() {
            let img = $('<figure></figure>').append($(this).clone());
            let figcaption = $(this).next()[0] || {};
            if (figcaption) {
                img.append($(`<figcaption><p>${$(figcaption).text()}</p></figcaption>`));
                $(figcaption).remove();
            }
            const image = libingester.util.download_img($(img.children()[0]));
            $(this).parent().replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);

       });

   

        // // article settings
        // asset.set_canonical_uri(uri);
        // asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        // asset.set_section(section);
        // asset.set_synopsis(description);
        // asset.set_title(title);
        //
        // // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
         body.find(REMOVE_ELEMENTS.join(',')).remove();
         clean_tags(body.find(CLEAN_ELEMENTS.join(',')));
        // body.find('a').get().map((a) => a.attribs.href = url.resolve(BASE_URI, a.attribs.href));
        //
        // // generating categories
        // const categories = cheerio('<div></div>');
        // category.find('a').get().map((a) => {
        //     categories.append(cheerio(`<a href="${url.resolve(BASE_URI,a.attribs.href)}">${$(a).text()}</a>`));
        // });
        //
        // // download images
        // let thumb;
        // body.find('img').get().map((img) => {
        //     clean_attr(img);
        //     const image = libingester.util.download_img(img);
        //     image.set_title(title);
        //     hatch.save_asset(image);
        //     if (!thumb) {
        //         asset.set_thumbnail(thumb=image);
        //     }
        // });
        //
        // const content = mustache.render(template.structure_template, {
        //     author: author,
        //     body: body.html(),
        //     category: categories.html(),
        //     published_date: published,
        //     title: title
        // });
        //
        // asset.set_document(content);
        // hatch.save_asset(asset);
                // Article Settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_title(title);
        asset.set_synopsis(description);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
//        asset.set_custom_scss(CUSTOM_CSS);

        asset.render();
        hatch.save_asset(asset);

    }).catch((err) => {
        console.log(uri+' '+err);
    })
}

function main() {
    const hatch = new libingester.Hatch('girl_eat_world', 'en');


   

   // ingest_article(hatch, 'https://girleatworld.net/2017/07/09/overnight-sleeper-train-eastern-europe/')
     //   .then(() => then.finish());
    libingester.util.fetch_html(BASE_URI).then(($) => {
        const links = $('.entry-thumb a').get().map((a) => $(a).attr('href'));
        Promise.all(links.map((uri) => ingest_article(hatch,uri))).then(() => {
            return hatch.finish();
        })
    })
}

main();